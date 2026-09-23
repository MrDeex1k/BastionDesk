import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import analyticsRoutes from "./analytics.js";

const router = Router();

// Wszystkie route'y dla admina wymagają autoryzacji i roli 'admin'
router.use(requireAuth);
router.use(requireRole(["admin"]));

// Route'y dla statystyk
router.use("/analytics", analyticsRoutes);

export default router;
