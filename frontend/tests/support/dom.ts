import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost:4567" });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
