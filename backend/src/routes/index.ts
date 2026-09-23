import { Router } from "express";
import adminRoutes from "./admin/index.js";

const router = Router();

// Middleware sprawdzające rolę użytkownika
// Endpointy dla pracowników są dostępne w głównym routerze /api/incidents/*
router.use("/admin", adminRoutes);

export default router;
