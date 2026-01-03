import { Router } from "express";
import adminRoutes from "./admin/index.js";
import analystRoutes from "./analyst/index.js";

const router = Router();

// Middleware sprawdzające rolę użytkownika
// Endpointy dla pracowników są dostępne w głównym routerze /api/incidents/*
router.use("/analyst", analystRoutes);
router.use("/admin", adminRoutes);

export default router;
