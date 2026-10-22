exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION prevent_audit_logs_modification()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'audit_logs entries are immutable and cannot be updated or deleted';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_prevent_audit_logs_update ON audit_logs;
    CREATE TRIGGER trg_prevent_audit_logs_update
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_logs_modification();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_prevent_audit_logs_update ON audit_logs;
    DROP FUNCTION IF EXISTS prevent_audit_logs_modification();
  `);
};
