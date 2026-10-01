-- UCCC production only: this script exists on the fork's `uccc-prod` branch and never upstream.
--
-- Production reached 7.7.1 on the patched fork (2026-09-19). Fork-only registrations had already
-- applied the first Volunteer v2 schema, the Member Portal columns, the email log and the
-- second-address columns there, so the release branch's 7.8.0 scripts would fail against it
-- (plain ADD COLUMN of columns that exist). The fork's upgrade.json therefore runs upstream's
-- fund-category script and this one instead. Together they turn production's 7.7.1 schema into
-- the 7.8.0 schema of `release/7.8.0-portal-volunteer` (compared column by column, index by index
-- and key by key against a fresh Install.sql on a copy of the production database, 2026-10-01).
--
-- What changes, all from the Volunteer v2 core-reuse revision (design §0.8, D20–D33):
--   * occurrences take their times from the anchored event (D20): the stored times go;
--   * schedules find events by type, class, ministry or one event, with offsets (D21, D22),
--     and no longer generate dates of their own (D20, D31): the recurrence columns go;
--   * a team may be linked to a Sunday School class (D23), a ministry says whether it
--     provides teachers (D29), administrators open calendars to ministries (D25);
--   * default volunteers live on a schedule's staffing needs (D32);
--   * the "Other" event type (D31).
--
-- Production has no schedules or occurrences (V2 is off there), so no row needs converting;
-- were there a `standalone` schedule, the LinkMode change below would refuse it and the
-- upgrade would stop before anything else ran.

ALTER TABLE `volunteer_occurrence_vocc`
  DROP INDEX `vocc_schedule_start_uidx`,
  DROP COLUMN `vocc_StartDateTime`,
  DROP COLUMN `vocc_EndDateTime`;

ALTER TABLE `volunteer_schedule_vsch`
  MODIFY COLUMN `vsch_LinkMode` enum('event_type','class','ministry','event') NOT NULL,
  DROP COLUMN `vsch_RecurType`,
  DROP COLUMN `vsch_RecurDOW`,
  DROP COLUMN `vsch_RecurDOM`,
  DROP COLUMN `vsch_StartTime`,
  DROP COLUMN `vsch_EndTime`,
  DROP COLUMN `vsch_GenerateAheadDays`,
  ADD COLUMN `vsch_grp_ID` mediumint(8) unsigned DEFAULT NULL AFTER `vsch_TitleFilter`,
  ADD COLUMN `vsch_event_id` int(11) DEFAULT NULL AFTER `vsch_grp_ID`,
  ADD COLUMN `vsch_StartOffsetMinutes` int(11) NOT NULL DEFAULT 0 AFTER `vsch_event_id`,
  ADD COLUMN `vsch_EndOffsetMinutes` int(11) NOT NULL DEFAULT 0 AFTER `vsch_StartOffsetMinutes`,
  ADD KEY `vsch_group_idx` (`vsch_grp_ID`),
  ADD KEY `vsch_event_idx` (`vsch_event_id`),
  ADD CONSTRAINT `fk_vsch_group` FOREIGN KEY (`vsch_grp_ID`)
      REFERENCES `group_grp` (`grp_ID`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_vsch_event` FOREIGN KEY (`vsch_event_id`)
      REFERENCES `events_event` (`event_id`) ON DELETE SET NULL;

ALTER TABLE `volunteer_requirement_vreq`
  ADD COLUMN `vreq_Default_per_ID` mediumint(9) unsigned DEFAULT NULL AFTER `vreq_Notes`,
  ADD COLUMN `vreq_DefaultAccepted` tinyint(1) unsigned NOT NULL DEFAULT 0 AFTER `vreq_Default_per_ID`,
  ADD COLUMN `vreq_DefaultSetBy_per_ID` mediumint(9) unsigned DEFAULT NULL AFTER `vreq_DefaultAccepted`,
  ADD KEY `vreq_default_person_idx` (`vreq_Default_per_ID`),
  ADD KEY `vreq_default_set_by_idx` (`vreq_DefaultSetBy_per_ID`),
  ADD CONSTRAINT `fk_vreq_default_person` FOREIGN KEY (`vreq_Default_per_ID`)
      REFERENCES `person_per` (`per_ID`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_vreq_default_set_by` FOREIGN KEY (`vreq_DefaultSetBy_per_ID`)
      REFERENCES `person_per` (`per_ID`) ON DELETE SET NULL;

ALTER TABLE `volunteer_team_vtem`
  ADD COLUMN `vtem_grp_ID` mediumint(8) unsigned DEFAULT NULL AFTER `vtem_Active`,
  ADD UNIQUE KEY `vtem_class_group_uidx` (`vtem_grp_ID`),
  ADD CONSTRAINT `fk_vtem_class_group` FOREIGN KEY (`vtem_grp_ID`)
      REFERENCES `group_grp` (`grp_ID`) ON DELETE SET NULL;

ALTER TABLE `volunteer_ministry_vmin`
  ADD COLUMN `vmin_SundaySchool` tinyint(1) unsigned NOT NULL DEFAULT 0 AFTER `vmin_HelpWantedText`;

CREATE TABLE IF NOT EXISTS `volunteer_calendar_vcal` (
  `vcal_calendar_id` int(11) NOT NULL,
  `vcal_vmin_ID`     int(11) NOT NULL,
  PRIMARY KEY (`vcal_calendar_id`, `vcal_vmin_ID`),
  KEY `vcal_ministry_idx` (`vcal_vmin_ID`),
  CONSTRAINT `fk_vcal_calendar` FOREIGN KEY (`vcal_calendar_id`)
      REFERENCES `calendars` (`calendar_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_vcal_ministry` FOREIGN KEY (`vcal_vmin_ID`)
      REFERENCES `volunteer_ministry_vmin` (`vmin_ID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `event_types` (`type_name`, `type_defrecurtype`, `type_defrecurDOM`, `type_active`) SELECT 'Other', 'none', '', 1
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `event_types` WHERE `type_name` = 'Other');
