DROP VIEW IF EXISTS email_list;
CREATE VIEW email_list AS
    SELECT per_email AS email, 'person_home' AS type, per_id AS id FROM person_per WHERE per_email IS NOT NULL AND per_email != ''
    UNION
    SELECT per_WorkEmail AS email, 'person_work' AS type, per_id AS id FROM person_per WHERE per_WorkEmail IS NOT NULL AND per_WorkEmail != '';

DROP VIEW IF EXISTS email_count;
CREATE VIEW email_count AS
    SELECT email, COUNT(*) AS total FROM email_list group by email;
