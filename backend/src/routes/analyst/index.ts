import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import incidentRoutes from "./incidents.js";

const router = Router();

// Wszystkie route'y dla analityków wymagają zalogowania i roli 'analityk' lub 'admin'
router.use(requireAuth);
router.use(requireRole(["analityk", "admin"]));

// Route'y dla incydentów
router.use("/incidents", incidentRoutes);

export default router;
