import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { queryOne } from '../../lib/database.js';

export const requireRole = (requiredRole: 'admin' | 'analityk' | 'pracownik') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;

    // Sprawdź czy użytkownik należy do organizacji
    if (!authReq.organizationId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'NO_ORGANIZATION',
          message: 'Użytkownik nie należy do żadnej organizacji',
        },
      });
    }

    // Sprawdź rolę użytkownika
    const userRole = authReq.memberRole;
    if (!userRole || userRole !== requiredRole) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Niewystarczające uprawnienia',
        },
      });
    }

    next();
  };
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  // Sprawdź czy użytkownik jest zalogowany
  if (!authReq.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

/**
 * Middleware sprawdzający czy użytkownik ma dostęp do konkretnego incydentu
 * Sprawdza czy incydent należy do tej samej organizacji co użytkownik
 */
export const requireOrganizationAccess = (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const incidentId = req.params.id;

  if (!incidentId) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_INCIDENT_ID',
        message: 'Brak ID incydentu',
      },
    });
  }

  if (!authReq.organizationId) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'NO_ORGANIZATION',
        message: 'Użytkownik nie należy do żadnej organizacji',
      },
    });
  }

  // Sprawdź czy incydent należy do tej samej organizacji co użytkownik
  queryOne<{ organizationId: string }>(`
    SELECT "organizationId" FROM incidents
    WHERE id = $1
  `, [incidentId])
    .then((incident) => {
      if (!incident) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'INCIDENT_NOT_FOUND',
            message: 'Zgłoszenie nie zostało znalezione',
          },
        });
      }

      if (incident.organizationId !== authReq.organizationId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ORGANIZATION_ACCESS_DENIED',
            message: 'Brak dostępu do zgłoszenia z innej organizacji',
          },
        });
      }

      next();
    })
    .catch((error) => {
      console.error('[MIDDLEWARE] Organization access check error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ORGANIZATION_CHECK_ERROR',
          message: 'Błąd sprawdzania dostępu do organizacji',
        },
      });
    });
};