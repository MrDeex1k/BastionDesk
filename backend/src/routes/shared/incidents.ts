// Wspólne funkcje dla obsługi incydentów
// Używane przez wszystkie typy użytkowników

// Typy pomocnicze - używamy głównego interface z types/index.ts
import type { Incident } from '../../types/index';
export type { Incident };

// Wspólne funkcje walidacji i przetwarzania
export const validateIncidentData = (data: any) => {
  // Walidacja danych incydentu
};

export const formatIncidentResponse = (incident: Incident) => {
  // Formatowanie odpowiedzi dla API
};

export const checkIncidentAccess = (incident: Incident, userId: string, userRole: string) => {
  // Sprawdzenie uprawnień dostępu do incydentu
};
