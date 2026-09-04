\set ON_ERROR_STOP on

BEGIN;

INSERT INTO "user" (id, name, email, "emailVerified")
VALUES
	('baseline-' || :'run_id' || '-admin-a', 'Baseline Admin A', :'run_id' || '-admin-a@example.test', true),
	('baseline-' || :'run_id' || '-analyst-a', 'Baseline Analyst A', :'run_id' || '-analyst-a@example.test', true),
	('baseline-' || :'run_id' || '-employee-a', 'Baseline Employee A', :'run_id' || '-employee-a@example.test', true),
	('baseline-' || :'run_id' || '-employee-b', 'Baseline Employee B', :'run_id' || '-employee-b@example.test', true);

INSERT INTO organization (id, name, slug, metadata)
VALUES
	('baseline-' || :'run_id' || '-org-a', 'Baseline Organization A', 'baseline-a-' || :'run_id', jsonb_build_object('runId', :'run_id')),
	('baseline-' || :'run_id' || '-org-b', 'Baseline Organization B', 'baseline-b-' || :'run_id', jsonb_build_object('runId', :'run_id'));

INSERT INTO member (id, "organizationId", "userId", role)
VALUES
	('baseline-' || :'run_id' || '-member-admin-a', 'baseline-' || :'run_id' || '-org-a', 'baseline-' || :'run_id' || '-admin-a', 'admin'),
	('baseline-' || :'run_id' || '-member-analyst-a', 'baseline-' || :'run_id' || '-org-a', 'baseline-' || :'run_id' || '-analyst-a', 'analityk'),
	('baseline-' || :'run_id' || '-member-employee-a', 'baseline-' || :'run_id' || '-org-a', 'baseline-' || :'run_id' || '-employee-a', 'pracownik'),
	('baseline-' || :'run_id' || '-member-employee-b', 'baseline-' || :'run_id' || '-org-b', 'baseline-' || :'run_id' || '-employee-b', 'pracownik');

INSERT INTO incidents (
	id,
	"userId",
	"organizationId",
	"userDescription",
	"analystId",
	"analystReportPath",
	"analystReportMetadata",
	"llmCategory"
)
VALUES
	(
		:'incident_a'::uuid,
		'baseline-' || :'run_id' || '-employee-a',
		'baseline-' || :'run_id' || '-org-a',
		'TENANT_A_RESTORE_' || :'run_id',
		'baseline-' || :'run_id' || '-analyst-a',
		'incidents/' || :'incident_a' || '/report_baseline-a.pdf',
		jsonb_build_object('filename', 'baseline-a.pdf', 'size', 17),
		'Żółty'
	),
	(
		:'incident_b'::uuid,
		'baseline-' || :'run_id' || '-employee-b',
		'baseline-' || :'run_id' || '-org-b',
		'TENANT_B_SECRET_' || :'run_id',
		NULL,
		NULL,
		'{}'::jsonb,
		'Czerwony'
	);

SET LOCAL app.current_user_id = 'baseline-restore-test';
UPDATE incidents
SET status = 'Raport w trakcie'
WHERE id = :'incident_a'::uuid;

COMMIT;
