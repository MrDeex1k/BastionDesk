-- =============================================================================
-- 1. KONFIGURACJA TYPÓW DANYCH
-- =============================================================================

-- Typ wyliczeniowy dla statusu incydentu
-- Dostosuj statusy do swojego przepływu pracy
CREATE TYPE incident_status AS ENUM (
    'Zgłoszony',  
    'Raport w trakcie',    
    'Raport złożony',  
    'Sprawozdanie w trakcie',  
    'Sprawozdanie złożone',  
    'Odrzucone'  
);

-- Typ wyliczeniowy dla kategorii LLM (poziomy priorytetu/ryzyka)
CREATE TYPE incident_category AS ENUM (
    'Czerwony',     -- Wysoki priorytet/wysokie ryzyko
    'Żółty',        -- Średni priorytet/ryzyko
    'Zielony'       -- Niski priorytet/ryzyko
);

-- =============================================================================
-- 2. TABELA INCIDENTS (Zgłoszenia)
-- =============================================================================

CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    data_zgloszenia timestamptz NOT NULL DEFAULT now(),

    -- Powiązanie z tabelą 'user' z Better-Auth
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

    -- Status zgłoszenia
    status incident_status NOT NULL DEFAULT 'Zgłoszony',

    -- Opis użytkownika (wymagany)
    user_description text NOT NULL,

    -- DANE Z MINIO (JSONB)
    -- Przechowujemy tu metadane plików (bucket, path, filename, etag), a nie same pliki.
    -- Przykład: [{"path": "incidents/123/screen.png", "bucket": "secure-bucket"}]
    user_screenshot_data jsonb DEFAULT '[]'::jsonb,
    user_attachment_data jsonb DEFAULT '[]'::jsonb,

    -- Sekcja Analityka
    analyst_id text REFERENCES "user"(id) ON DELETE CASCADE,  -- NULL na starcie, ustawiane później
    analyst_note text,
    czy_rozwiązany BOOLEAN NOT NULL DEFAULT FALSE,
    data_rozwiązania timestamptz,  -- NULL na starcie, ustawiane przy rozwiązaniu
    analyst_report jsonb DEFAULT '{}'::jsonb,     -- Raport analityka (DOCX/PDF w MinIO)
    analyst_report_data timestamptz,  -- NULL na starcie
    analyst_statement jsonb DEFAULT '{}'::jsonb,  -- Sprawozdanie analityka (DOCX/PDF w MinIO)
    analyst_statement_data timestamptz,  -- NULL na starcie

    -- Kategoria nadana przez LLM (poziomy priorytetu/ryzyka)
    llm_category incident_category,
    
    -- Znaczniki czasu
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indeksy dla wydajności (User widzi swoje, Analityk widzi po statusie/dacie)
CREATE INDEX idx_incidents_user_id ON incidents(user_id);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_created_at ON incidents(created_at DESC);

-- =============================================================================
-- 3. TABELA INCIDENT_AUDIT_LOG (Historia zmian)
-- =============================================================================

CREATE TABLE IF NOT EXISTS incident_audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- Powiązanie z incydentem
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    
    -- Kto dokonał zmiany (ID użytkownika lub 'SYSTEM'/'LLM')
    changed_by text, 
    
    -- Rejestracja zmiany statusu
    old_status incident_status,
    new_status incident_status,
    
    -- Kiedy nastąpiła zmiana
    changed_at timestamptz NOT NULL DEFAULT now()
);

-- Indeks do szybkiego pobierania historii konkretnego incydentu
CREATE INDEX idx_audit_incident_id ON incident_audit_log(incident_id);

-- =============================================================================
-- 4. AUTOMATYZACJA (Triggery)
-- =============================================================================

-- A. Funkcja aktualizująca updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
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
            incident_id,
            changed_by,
            old_status,
            new_status,
            changed_at
        ) VALUES (
            NEW.id,
            -- Próbujemy pobrać user_id z bieżącej sesji SQL (jeśli aplikacja to ustawia)
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
    -- Jeśli czy_rozwiazany zmieniło się z FALSE na TRUE, ustaw datę rozwiązania
    IF (OLD.czy_rozwiazany = FALSE AND NEW.czy_rozwiazany = TRUE) THEN
        NEW.data_rozwiazania = now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger dla automatycznego ustawiania daty rozwiązania
CREATE TRIGGER set_resolution_date_trigger
BEFORE UPDATE ON incidents
FOR EACH ROW
EXECUTE PROCEDURE set_resolution_date();