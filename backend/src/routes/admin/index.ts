import { Router } from 'express';
import { requireRole } from '../../middleware/auth.middleware.js';
import incidentRoutes from './incidents.js';
import analyticsRoutes from './analytics.js';

const router = Router();

// Wszystkie route'y dla admina wymagają roli 'admin'
router.use(requireRole(['admin']));

// Route'y dla incydentów
router.use('/incidents', incidentRoutes);

// Route'y dla statystyk
router.use('/analytics', analyticsRoutes);

export default router;