import { Router } from 'express';
import analystRoutes from './analyst/index.js';
import adminRoutes from './admin/index.js';

const router = Router();

// Middleware sprawdzające rolę użytkownika
// Endpointy dla pracowników są dostępne w głównym routerze /api/incidents/*
router.use('/analyst', analystRoutes);
router.use('/admin', adminRoutes);

export default router;