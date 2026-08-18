import { FakeSportsProvider } from "./fakeAdapter";
import { sportsProviderContractTests } from "./contract";

sportsProviderContractTests(() => new FakeSportsProvider());
