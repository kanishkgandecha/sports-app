"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getF1Laps,
  getF1Results,
  getF1Stints,
  type F1DriverRef,
  type F1Lap,
  type F1SessionResult,
  type F1TyreStint,
} from "../../../lib/f1Api";
import { StateView } from "../StateView";
import styles from "./f1EventCenter.module.css";

type AnalysisTab = "classification" | "pace" | "strategy";

interface AnalysisState {
  results: F1SessionResult[];
  stints: F1TyreStint[];
  loading: boolean;
  error: boolean;
}

const EMPTY_ANALYSIS: AnalysisState = { results: [], stints: [], loading: true, error: false };

export function SessionAnalysis({ sessionId, sessionType }: { sessionId: string; sessionType: string }) {
  const [tab, setTab] = useState<AnalysisTab>("classification");
  const [analysis, setAnalysis] = useState<AnalysisState>(EMPTY_ANALYSIS);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [laps, setLaps] = useState<{ items: F1Lap[]; loading: boolean; error: boolean; truncated: boolean }>({
    items: [],
    loading: false,
    error: false,
    truncated: false,
  });

  useEffect(() => {
    let cancelled = false;
    setTab("classification");
    setAnalysis(EMPTY_ANALYSIS);
    setSelectedDriverId("");
    setLaps({ items: [], loading: false, error: false, truncated: false });

    void Promise.allSettled([getF1Results(sessionId), getF1Stints(sessionId)]).then(([result, stintResult]) => {
      if (cancelled) return;
      const results = result.status === "fulfilled" ? result.value.results : [];
      const stints = stintResult.status === "fulfilled" ? stintResult.value.stints : [];
      setAnalysis({
        results,
        stints,
        loading: false,
        error: result.status === "rejected" && stintResult.status === "rejected",
      });
      setSelectedDriverId(results[0]?.driver.id ?? stints[0]?.driver.id ?? "");
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (tab !== "pace" || !selectedDriverId) return;
    let cancelled = false;
    setLaps({ items: [], loading: true, error: false, truncated: false });
    void getF1Laps(sessionId, selectedDriverId).then(
      (response) => {
        if (!cancelled) {
          setLaps({ items: response.laps, loading: false, error: false, truncated: response.truncated });
        }
      },
      () => {
        if (!cancelled) setLaps({ items: [], loading: false, error: true, truncated: false });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sessionId, selectedDriverId, tab]);

  const drivers = useMemo(() => uniqueDrivers(analysis.results, analysis.stints), [analysis.results, analysis.stints]);

  return (
    <section className={`${styles.section} ${styles.analysisSection}`} aria-label="Session analysis">
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.analysisTitle}>Session analysis</h2>
          <p className={styles.analysisSubtitle}>{sessionType.replace(/_/g, " ")} · official historical data</p>
        </div>
      </div>

      <div className={styles.analysisTabs} role="tablist" aria-label="Session analysis view">
        <AnalysisTabButton active={tab === "classification"} onClick={() => setTab("classification")}>
          Classification
        </AnalysisTabButton>
        <AnalysisTabButton active={tab === "pace"} onClick={() => setTab("pace")}>
          Lap pace
        </AnalysisTabButton>
        <AnalysisTabButton active={tab === "strategy"} onClick={() => setTab("strategy")}>
          Tyre strategy
        </AnalysisTabButton>
      </div>

      {analysis.loading ? (
        <StateView kind="loading">Loading session analysis…</StateView>
      ) : analysis.error ? (
        <StateView kind="error">Session analysis isn&apos;t available right now.</StateView>
      ) : tab === "classification" ? (
        <ClassificationTable rows={analysis.results} />
      ) : tab === "pace" ? (
        <LapPace
          drivers={drivers}
          selectedDriverId={selectedDriverId}
          onSelectDriver={setSelectedDriverId}
          laps={laps.items}
          loading={laps.loading}
          error={laps.error}
          truncated={laps.truncated}
        />
      ) : (
        <TyreStrategy stints={analysis.stints} />
      )}
    </section>
  );
}

function AnalysisTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={[styles.analysisTab, active ? styles.analysisTabActive : ""].filter(Boolean).join(" ")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ClassificationTable({ rows }: { rows: F1SessionResult[] }) {
  if (rows.length === 0) {
    return <StateView kind="empty">Classification data has not been backfilled for this session yet.</StateView>;
  }
  const hasQualifyingPhases = rows.some((row) => row.phases.some((phase) => phase.duration !== null));
  return (
    <div className={styles.analysisScroll}>
      <table className={styles.analysisTable}>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">Driver</th>
            {hasQualifyingPhases ? (
              <>
                <th scope="col">Q1</th>
                <th scope="col">Q2</th>
                <th scope="col">Q3</th>
              </>
            ) : (
              <>
                <th scope="col">Laps</th>
                <th scope="col">Time / gap</th>
                <th scope="col">Pts</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.driver.id}>
              <td className={styles.position}>{row.position ?? row.status.toUpperCase()}</td>
              <td>
                <DriverLabel driver={row.driver} />
              </td>
              {hasQualifyingPhases ? (
                row.phases.map((phase, index) => <td key={index}>{formatLapTime(phase.duration)}</td>)
              ) : (
                <>
                  <td>{row.lapsCompleted}</td>
                  <td>{classificationTime(row)}</td>
                  <td className={styles.pointsCell}>{row.points ?? "—"}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LapPace({
  drivers,
  selectedDriverId,
  onSelectDriver,
  laps,
  loading,
  error,
  truncated,
}: {
  drivers: F1DriverRef[];
  selectedDriverId: string;
  onSelectDriver: (driverId: string) => void;
  laps: F1Lap[];
  loading: boolean;
  error: boolean;
  truncated: boolean;
}) {
  if (drivers.length === 0) {
    return <StateView kind="empty">Lap data has not been backfilled for this session yet.</StateView>;
  }
  const timedLaps = laps.filter((lap) => lap.duration !== null);
  const fastest = timedLaps.reduce<F1Lap | null>(
    (best, lap) => (best === null || (lap.duration ?? Infinity) < (best.duration ?? Infinity) ? lap : best),
    null,
  );
  return (
    <div className={styles.pacePanel}>
      <div className={styles.paceControls}>
        <label htmlFor="analysis-driver">Driver</label>
        <select id="analysis-driver" value={selectedDriverId} onChange={(event) => onSelectDriver(event.target.value)}>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </select>
        {fastest && (
          <span className={styles.fastestLap}>
            Fastest · {formatLapTime(fastest.duration)} on lap {fastest.lapNumber}
          </span>
        )}
      </div>
      {loading ? (
        <StateView kind="loading">Loading lap-by-lap pace…</StateView>
      ) : error ? (
        <StateView kind="error">Lap pace isn&apos;t available right now.</StateView>
      ) : laps.length === 0 ? (
        <StateView kind="empty">No lap records are available for this driver.</StateView>
      ) : (
        <div className={styles.analysisScroll}>
          <table className={styles.analysisTable}>
            <thead>
              <tr>
                <th scope="col">Lap</th>
                <th scope="col">Lap time</th>
                <th scope="col">S1</th>
                <th scope="col">S2</th>
                <th scope="col">S3</th>
                <th scope="col">Speed trap</th>
              </tr>
            </thead>
            <tbody>
              {laps.map((lap) => (
                <tr key={lap.id}>
                  <td className={styles.position}>
                    {lap.lapNumber}
                    {lap.isPitOutLap && <span className={styles.pitOut}>OUT</span>}
                  </td>
                  <td>{formatLapTime(lap.duration)}</td>
                  <td>{formatSector(lap.sector1)}</td>
                  <td>{formatSector(lap.sector2)}</td>
                  <td>{formatSector(lap.sector3)}</td>
                  <td>{lap.speedTrap === null ? "—" : `${lap.speedTrap} km/h`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {truncated && <p className={styles.analysisNote}>Showing the first 2,000 laps.</p>}
    </div>
  );
}

function TyreStrategy({ stints }: { stints: F1TyreStint[] }) {
  if (stints.length === 0) {
    return <StateView kind="empty">Tyre strategy data has not been backfilled for this session yet.</StateView>;
  }
  const groups = new Map<string, { driver: F1DriverRef; stints: F1TyreStint[] }>();
  for (const stint of stints) {
    const group = groups.get(stint.driver.id) ?? { driver: stint.driver, stints: [] };
    group.stints.push(stint);
    groups.set(stint.driver.id, group);
  }
  return (
    <div className={styles.strategyList}>
      {[...groups.values()].map(({ driver, stints: driverStints }) => (
        <div className={styles.strategyRow} key={driver.id}>
          <DriverLabel driver={driver} />
          <div className={styles.stintSequence}>
            {driverStints.map((stint) => (
              <div className={styles.stintCard} key={stint.id}>
                <span className={`${styles.compoundDot} ${compoundClass(stint.compound)}`} aria-hidden="true" />
                <strong>{stint.compound ?? "Unknown"}</strong>
                <span>
                  Laps {stint.lapStart}–{stint.lapEnd ?? "?"}
                </span>
                {stint.tyreAgeAtStart !== null && stint.tyreAgeAtStart > 0 && (
                  <small>used +{stint.tyreAgeAtStart}</small>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DriverLabel({ driver }: { driver: F1DriverRef }) {
  return (
    <div className={styles.driverCell}>
      <span
        className={styles.teamSwatch}
        style={{ background: driver.team?.colorHex ?? "var(--color-border)" }}
        aria-hidden="true"
      />
      <span className={styles.driverCode}>{driver.shortName ?? driver.name.slice(0, 3).toUpperCase()}</span>
      <span className={styles.driverFullName}>{driver.name}</span>
    </div>
  );
}

function uniqueDrivers(results: F1SessionResult[], stints: F1TyreStint[]): F1DriverRef[] {
  const drivers = new Map<string, F1DriverRef>();
  for (const row of results) drivers.set(row.driver.id, row.driver);
  for (const stint of stints) drivers.set(stint.driver.id, stint.driver);
  return [...drivers.values()];
}

function classificationTime(row: F1SessionResult): string {
  if (row.status !== "classified") return row.status.toUpperCase();
  return row.gapToLeader ?? formatRaceDuration(row.durationSeconds);
}

function formatRaceDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = (seconds % 60).toFixed(3).padStart(6, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}

function formatLapTime(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds % 60).toFixed(3).padStart(6, "0");
  return minutes > 0 ? `${minutes}:${rest}` : rest;
}

function formatSector(seconds: number | null): string {
  return seconds === null ? "—" : seconds.toFixed(3);
}

function compoundClass(compound: string | null): string {
  if (compound === "SOFT") return styles.tyreSoft;
  if (compound === "MEDIUM") return styles.tyreMedium;
  if (compound === "HARD") return styles.tyreHard;
  if (compound === "INTERMEDIATE") return styles.tyreIntermediate;
  if (compound === "WET") return styles.tyreWet;
  return "";
}
