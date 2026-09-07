import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { trackTimers } from "./timers";

GlobalRegistrator.register({ url: "http://localhost:4567" });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
trackTimers();
