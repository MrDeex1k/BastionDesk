import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import analyticsRoutes from "./analytics.js";
import incidentRoutes from "./incidents.js";

const router = Router();

// Wszystkie route'y dla admina wymagają autoryzacji i roli 'admin'
router.use(requireAuth);
router.use(requireRole(["admin"]));

// Route'y dla incydentów
router.use("/incidents", incidentRoutes);

// Route'y dla statystyk
router.use("/analytics", analyticsRoutes);

export default router;
