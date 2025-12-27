import { Router } from 'express';
import { requireRole } from '../../middleware/auth.middleware.js';
import incidentRoutes from './incidents.js';

const router = Router();

// Wszystkie route'y dla analityków wymagają roli 'analyst'
router.use(requireRole(['analityk']));

// Route'y dla incydentów
router.use('/incidents', incidentRoutes);

export default router;