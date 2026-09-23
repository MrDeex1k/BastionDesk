import { createHash } from "node:crypto";
import type { Client } from "pg";

export const checksum = (text: string) => createHash("sha256").update(text).digest("hex");

// PostgreSQL 18 public application schema; excludes objects owned by extensions.
// Names and definitions, never OIDs, owners or sequence current values.
export async function schemaFingerprint(client: Client): Promise<string> {
	const { rows } = await client.query<{ kind: string; name: string; definition: string }>(`
		WITH relations AS (
			SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = 'public' AND NOT EXISTS (
				SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
				AND d.objid = c.oid AND d.deptype = 'e'
			)
		), definitions AS (
			SELECT 'relation' AS kind, c.relname::text AS name,
				concat_ws('|', c.relkind, c.relpersistence, c.relrowsecurity, c.relforcerowsecurity) AS definition
			FROM relations c WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S')
			UNION ALL
			SELECT 'column', c.relname || '.' || a.attname,
				concat_ws('|', a.attnum, format_type(a.atttypid,a.atttypmod), a.attnotnull,
					a.attidentity, a.attgenerated, pg_get_expr(d.adbin,d.adrelid), a.attcollation::regcollation::text)
			FROM relations c JOIN pg_attribute a ON a.attrelid = c.oid
			LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
			WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m')
			UNION ALL
			SELECT 'constraint', c.relname || '.' || k.conname,
				pg_get_constraintdef(k.oid) || '|' || k.convalidated
			FROM relations c JOIN pg_constraint k ON k.conrelid = c.oid
			UNION ALL
			SELECT 'index', c.relname, pg_get_indexdef(c.oid) || '|' || i.indisvalid || '|' || i.indisready
			FROM relations c JOIN pg_index i ON i.indexrelid = c.oid
			UNION ALL
			SELECT 'trigger', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) || '|' || t.tgenabled::text
			FROM relations c JOIN pg_trigger t ON t.tgrelid = c.oid WHERE NOT t.tgisinternal
			UNION ALL
			SELECT 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
				pg_get_functiondef(p.oid)
			FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
			WHERE n.nspname = 'public' AND p.prokind IN ('f','p') AND NOT EXISTS (
				SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass
				AND d.objid = p.oid AND d.deptype = 'e'
			)
			UNION ALL
			SELECT 'enum', t.typname, string_agg(e.enumlabel, '|' ORDER BY e.enumsortorder)
			FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
			JOIN pg_enum e ON e.enumtypid = t.oid WHERE n.nspname = 'public' GROUP BY t.typname
			UNION ALL
			SELECT 'extension', extname, extversion FROM pg_extension
			UNION ALL
			SELECT 'policy', c.relname || '.' || p.polname,
				concat_ws('|',p.polcmd,p.polpermissive,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid))
			FROM relations c JOIN pg_policy p ON p.polrelid = c.oid
			UNION ALL
			SELECT 'view', c.relname, pg_get_viewdef(c.oid) FROM relations c WHERE c.relkind IN ('v','m')
		)
		SELECT * FROM definitions ORDER BY kind COLLATE "C", name COLLATE "C"
	`);
	return checksum(JSON.stringify(rows));
}
