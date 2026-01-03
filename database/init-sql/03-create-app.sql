-- 1. KONFIGURACJA TYPÓW DANYCH

-- Typ wyliczeniowy dla statusu incydentu
-- Dostosuj statusy do swojego przepływu pracy
CREATE TYPE "IncidentStatus" AS ENUM (
    'Zgłoszony',  
    'Raport w trakcie',    
    'Raport złożony',  
    'Sprawozdanie w trakcie',  
    'Sprawozdanie złożone',  
    'Odrzucone'  
);

-- Typ wyliczeniowy dla kategorii LLM (poziomy priorytetu/ryzyka)
CREATE TYPE "IncidentCategory" AS ENUM (
    'Czerwony',     -- Wysoki priorytet/wysokie ryzyko
    'Żółty',        -- Średni priorytet/ryzyko
    'Zielony'       -- Niski priorytet/ryzyko
);

-- 2. TABELA INCIDENTS (Zgłoszenia)

CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    "dataZgloszenia" timestamp NOT NULL DEFAULT now(),

    -- Powiązanie z tabelą 'user' z Better-Auth
    "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

    -- Powiązanie z organizacją
    "organizationId" text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,

    -- Status zgłoszenia
    status "IncidentStatus" NOT NULL DEFAULT 'Zgłoszony',

    -- Opis użytkownika (wymagany)
    "userDescription" text NOT NULL,

    -- DANE Z MINIO - ŚCIEŻKI PLIKÓW (tekst) + METADANE (JSONB)
    -- Przykład ścieżki: "incidents/123/screen.png"
    -- Przykład metadanych: {"bucket": "secure-bucket", "filename": "screen.png", "size": 1024}
    "userScreenshotPath" text,
    "userScreenshotMetadata" jsonb DEFAULT '{}'::jsonb,
    "userAttachmentPath" text,
    "userAttachmentMetadata" jsonb DEFAULT '{}'::jsonb,

    -- Sekcja Analityka
    "analystId" text REFERENCES "user"(id) ON DELETE CASCADE,  -- NULL na starcie, ustawiane później
    "analystNote" text,
    "czyRozwiazany" BOOLEAN NOT NULL DEFAULT FALSE,
    "dataRozwiazania" timestamp,  -- NULL na starcie, ustawiane przy rozwiązaniu
    "analystReportPath" text,                      -- Ścieżka do raportu analityka (DOCX/PDF w MinIO)
    "analystReportMetadata" jsonb DEFAULT '{}'::jsonb,  -- Metadane raportu analityka
    "analystReportData" timestamp,  -- NULL na starcie
    "analystStatementPath" text,                   -- Ścieżka do sprawozdania analityka (DOCX/PDF w MinIO)
    "analystStatementMetadata" jsonb DEFAULT '{}'::jsonb,  -- Metadane sprawozdania analityka
    "analystStatementData" timestamp,  -- NULL na starcie

    -- Kategoria nadana przez LLM (poziomy priorytetu/ryzyka)
    "llmCategory" "IncidentCategory",

    -- Znaczniki czasu
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- Indeksy dla wydajności (User widzi swoje, Analityk widzi po statusie/dacie)
CREATE INDEX idx_incidents_userId ON incidents("userId");
CREATE INDEX idx_incidents_organizationId ON incidents("organizationId");
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_createdAt ON incidents("createdAt" DESC);
CREATE INDEX idx_incidents_analystId ON incidents("analystId");
CREATE INDEX idx_incidents_czyRozwiazany ON incidents("czyRozwiazany");

-- 3. TABELA INCIDENT_AUDIT_LOG (Historia zmian)

CREATE TABLE IF NOT EXISTS incident_audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Powiązanie z incydentem
    "incidentId" UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,

    -- Kto dokonał zmiany (ID użytkownika lub 'SYSTEM'/'LLM')
    "changedBy" text,

    -- Rejestracja zmiany statusu
    "oldStatus" "IncidentStatus",
    "newStatus" "IncidentStatus",

    -- Kiedy nastąpiła zmiana
    "changedAt" timestamp NOT NULL DEFAULT now()
);

-- Indeks do szybkiego pobierania historii konkretnego incydentu
CREATE INDEX idx_audit_incidentId ON incident_audit_log("incidentId");

-- 4. AUTOMATYZACJA (Triggery)

-- A. Funkcja aktualizująca updatedAt
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger dla incidents
CREATE TRIGGER set_timestamp_incidents
BEFORE UPDATE ON incidents
FOR EACH ROW
EXECUTE PROCEDURE update_timestamp();

-- B. Funkcja automatycznie logująca zmiany statusu do audit_log
CREATE OR REPLACE FUNCTION log_incident_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Uruchom tylko jeśli status uległ zmianie
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO incident_audit_log (
            "incidentId",
            "changedBy",
            "oldStatus",
            "newStatus",
            "changedAt"
        ) VALUES (
            NEW.id,
            -- Próbujemy pobrać userId z bieżącej sesji SQL (jeśli aplikacja to ustawia)
            -- W przeciwnym razie wpisujemy NULL lub trzeba to obsługiwać z poziomu kodu aplikacji
            COALESCE(current_setting('app.current_user_id', true), 'SYSTEM'),
            OLD.status,
            NEW.status,
            now()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger dla audit log
CREATE TRIGGER log_status_change
AFTER UPDATE ON incidents
FOR EACH ROW
EXECUTE PROCEDURE log_incident_changes();

-- C. Funkcja automatycznie ustawiająca datę rozwiązania gdy incydent zostanie oznaczony jako rozwiązany
CREATE OR REPLACE FUNCTION set_resolution_date()
RETURNS TRIGGER AS $$
BEGIN
    -- Jeśli czyRozwiazany zmieniło się z FALSE na TRUE, ustaw datę rozwiązania
    IF (OLD."czyRozwiazany" = FALSE AND NEW."czyRozwiazany" = TRUE) THEN
        NEW."dataRozwiazania" = now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger dla automatycznego ustawiania daty rozwiązania
CREATE TRIGGER set_resolution_date_trigger
BEFORE UPDATE ON incidents
FOR EACH ROW
EXECUTE PROCEDURE set_resolution_date();