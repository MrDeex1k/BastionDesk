export type EvidenceSuite = "baseline" | "fixture" | "restore";
export type Coverage = "full" | "partial" | "missing";

export interface P0Scenario {
  id: string;
  coverage: Coverage;
  suites: EvidenceSuite[];
  evidence: string;
  gap?: string;
}

export const p0Scenarios: readonly P0Scenario[] = [
  {
    id: "AUTH-01-01",
    coverage: "full",
    suites: ["fixture"],
    evidence: "Rejestracja, email w Mailpit i 401 przed weryfikacją.",
  },
  {
    id: "AUTH-01-02",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Ważny link weryfikuje konto i tworzy sesję przez autoSignInAfterVerification.",
  },
  {
    id: "AUTH-02-01",
    coverage: "full",
    suites: ["fixture"],
    evidence: "Logowanie, cookie i /get-session dla pełnej macierzy kont.",
  },
  {
    id: "AUTH-02-02",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Błędne hasło daje 4xx, nie ustawia cookie Better Auth, a chroniony endpoint zwraca 401.",
  },
  {
    id: "AUTH-02-03",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Sign-out usuwa sesję i kolejny odczyt chronionego endpointu zwraca 401 UNAUTHORIZED.",
  },
  {
    id: "AUTH-03-01",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Token z wiadomości Mailpit zmienia hasło; stare jest odrzucane, a nowe tworzy sesję.",
  },
  {
    id: "ORG-01-01",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Publiczna rejestracja tworzy dwie organizacje, adminów i aktywne sesje.",
  },
  {
    id: "ORG-01-02",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Zajęty slug zwraca 409 ORGANIZATION_SLUG_EXISTS i nie pozostawia częściowego użytkownika.",
  },
  {
    id: "ORG-02-01",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Lista organizacji, set-active, sesja i aktywne członkostwo wskazują ORG_A i rolę admin.",
  },
  {
    id: "ORG-02-02",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Admin dodaje, zmienia rolę i usuwa członka; list-members potwierdza każdy etap.",
  },
  {
    id: "ORG-02-03",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Pracownik dostaje 403 dla add/update/remove, a członkostwo pozostaje bez zmian.",
  },
  {
    id: "ORG-02-04",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Odczyt i mutacje członka ORG_B po organizationId, ID i emailu są odrzucane bez zmiany stanu.",
  },
  {
    id: "ORG-02-05",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "USER_NO_ORG dostaje 403 NO_ORGANIZATION na endpointach pracownika, analityka i admina.",
  },
  {
    id: "ORG-02-06",
    coverage: "full",
    suites: ["baseline", "fixture"],
    evidence:
      "Pracownik i jawnie obca organizacja dostają rzeczywiste HTTP 403.",
  },
  {
    id: "INC-01-01",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "API i PostgreSQL potwierdzają właściciela, ORG_A, status Zgłoszony i puste ścieżki.",
  },
  {
    id: "INC-01-02",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "PNG i attachment mają zgodne prefiksy, metadane, dwa obiekty storage i identyczne pobrania.",
  },
  {
    id: "INC-01-04",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "/my ma total=1 i nie zawiera ID, rekordu ani markera treści ORG_B.",
  },
  {
    id: "INC-01-05",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Autor, analityk i ADMIN_A odczytują rekord; EMPLOYEE_A2, EMPLOYEE_B i ADMIN_B dostają 404.",
  },
  {
    id: "INC-02-01",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Kolejki assigned/unassigned są sprawdzane z danymi obu tenantów.",
  },
  {
    id: "INC-02-02",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Przypisanie jest widoczne w kolejce właściciela i zmienia status.",
  },
  {
    id: "INC-02-03",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Drugi analityk dostaje 409, a porównanie przed/po potwierdza niezmienionego właściciela i status.",
  },
  {
    id: "INC-02-04",
    coverage: "full",
    suites: ["baseline", "fixture"],
    evidence:
      "Details, assign, unassign i plik ORG_A są dla ANALYST_B nierozróżnialne od nieistniejącego UUID.",
  },
  {
    id: "INC-02-05",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "ANALYST_A2 dostaje 403, a właściciel przypisania czyści analystId i przywraca Zgłoszony.",
  },
  {
    id: "INC-02-07",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Odczyt potwierdza trwały status, notatkę, rosnący updatedAt i wpis audytu.",
  },
  {
    id: "INC-02-08",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Status i notatka ANALYST_A2/ANALYST_B są odrzucane; rekord, updatedAt i audyt się nie zmieniają.",
  },
  {
    id: "INC-02-09",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Resolve utrwala czyRozwiazany i dataRozwiazania; ponowienie zwraca ALREADY_RESOLVED.",
  },
  {
    id: "INC-03-01",
    coverage: "full",
    suites: ["baseline", "fixture"],
    evidence:
      "PDF trafia pod klucz serwerowy, status i audyt się zmieniają, bajty pobrania są zgodne.",
  },
  {
    id: "INC-03-02",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "DOCX po raporcie zmienia status, zapisuje audyt i wraca z identycznymi bajtami.",
  },
  {
    id: "INC-03-03",
    coverage: "full",
    suites: ["baseline", "fixture"],
    evidence:
      "Brak danych, base64, MIME, nazwa, sygnatura i limit 50 MiB dają 4xx bez zmiany rekordu lub storage.",
  },
  {
    id: "INC-03-04",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Każdy typ pliku wraca autorowi, analitykowi i adminowi z identycznymi bajtami oraz bezpiecznymi nagłówkami.",
  },
  {
    id: "INC-03-05",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "ANALYST_A2 ma dostęp rolowy; EMPLOYEE_A2 oraz pracownik, analityk i admin ORG_B dostają 404.",
  },
  {
    id: "INC-04-01",
    coverage: "full",
    suites: ["baseline", "fixture"],
    evidence:
      "QUERY sprawdza filtry, total, dwie strony i deterministyczny tie-breaker ID przy równych datach.",
  },
  {
    id: "INC-04-04",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Filtry i statystyki po LLM obejmują wyłącznie ORG_A, w tym kategorie i czas rozwiązania.",
  },
  {
    id: "INC-04-05",
    coverage: "full",
    suites: ["baseline", "fixture"],
    evidence:
      "Żywe API wykonuje wszystkie metryki i osobno jedną; niewybrane serie są puste, a ORG_B nie wycieka.",
  },
  {
    id: "INC-04-07",
    coverage: "full",
    suites: ["fixture"],
    evidence:
      "Analityk i pracownik dostają 403 na endpointach admina; lista i agregaty ADMIN_B zawierają tylko ORG_B.",
  },
  {
    id: "LLM-01-01",
    coverage: "full",
    suites: ["baseline", "fixture"],
    evidence:
      "Kontrakt przyjmuje trzy kategorie, a prawdziwy LLM zapisuje kategorię przy każdym ID.",
  },
  {
    id: "LLM-01-02",
    coverage: "full",
    suites: ["baseline", "fixture"],
    evidence:
      "Klient odrzuca pustą/nieznaną kategorię, a integracyjny błąd klasyfikacji pozostawia dostępny incydent z null.",
  },
  {
    id: "LLM-01-03",
    coverage: "full",
    suites: ["baseline", "fixture"],
    evidence:
      "Timeout/UNAVAILABLE są retryable; po zatrzymaniu LLM POST nadal daje 201, a incydent pozostaje dostępny.",
  },
  {
    id: "OPS-01-01",
    coverage: "full",
    suites: ["restore"],
    evidence: "Test tworzy dump w S3 i sprawdza stan healthchecku backupu.",
  },
  {
    id: "OPS-01-02",
    coverage: "full",
    suites: ["restore"],
    evidence:
      "Dump jest odtwarzany do czystego PostgreSQL, a liczności i fingerprint są porównywane.",
  },
  {
    id: "OPS-01-03",
    coverage: "full",
    suites: ["restore"],
    evidence:
      "Osobny backend nad odtworzoną bazą akceptuje zachowaną sesję, odczytuje ORG_A i zwraca 404 dla ORG_B.",
  },
] as const;
