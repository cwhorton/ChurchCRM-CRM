/// <reference types="cypress" />

/**
 * Charset regression guard for the notes API (issue #9754, original fix #8856).
 *
 * `note_nte` is created as utf8mb4 by `src/mysql/install/Install.sql` and converted
 * to utf8mb4 by `src/mysql/upgrade/7.3.1-cleanup.sql`, but `cypress/data/seed.sql`
 * used to create it as utf8mb3 — so a 4-byte character (any emoji) blew up with a
 * 500 on the test database while working fine on a real install.
 *
 * This spec fails with HTTP 500 on the POST if the seeded `note_nte` is ever
 * reverted to a 3-byte charset.
 */
describe("API Private Notes - 4-byte UTF-8 (emoji) round-trip", () => {
    // A mix of 4-byte characters: emoji, a skin-tone sequence and a CJK extension B
    // ideograph — all of which require utf8mb4.
    const emoji = "🎉👍🏽𠜎";

    /**
     * Ids of notes created by the running test.
     *
     * Cleanup lives in `afterEach`, not at the end of the test body: a failing
     * assertion inside a `.then()` throws immediately and drops every command
     * still queued behind it, so an inline DELETE is silently skipped on the
     * exact runs that create rows nobody expects. The leaked note then shows up
     * in /api/person/1/notes for the rest of the CI run.
     *
     * @type {number[]}
     */
    let createdNoteIds = [];

    afterEach(() => {
        const ids = createdNoteIds;
        createdNoteIds = [];
        ids.forEach((id) => {
            // A note the test already deleted answers 404 — fine, this is a
            // best-effort sweep, and the tests assert their own DELETE.
            cy.makePrivateAdminAPICall("DELETE", `/api/note/${id}`, null, [200, 404]);
        });
    });

    it("Round-trips an emoji note body through create, read and delete", () => {
        const text = `<p>Cypress emoji charset probe ${emoji}</p>`;

        cy.makePrivateAdminAPICall("POST", "/api/person/1/note", { text, private: false }, 201).then(
            (createResp) => {
                const note = createResp.body.note;
                expect(note).to.have.property("id");
                createdNoteIds.push(note.id);
                expect(note.text, "emoji survives the insert").to.contain(emoji);

                // Read it back from the database, not from the create response.
                cy.makePrivateAdminAPICall("GET", `/api/note/${note.id}`, null, 200).then(
                    (getResp) => {
                        expect(getResp.body.note.text, "emoji survives the round-trip").to.contain(
                            emoji,
                        );
                    },
                );

                // It must also survive the list query.
                cy.makePrivateAdminAPICall("GET", "/api/person/1/notes", null, 200).then(
                    (listResp) => {
                        const listed = listResp.body.notes.find((n) => n.id === note.id);
                        expect(listed, "created note appears in the person's note list").to.exist;
                        expect(listed.text).to.contain(emoji);
                    },
                );

                // DELETE is asserted here as part of the round-trip; afterEach
                // is the safety net for the runs that never reach this line.
                cy.makePrivateAdminAPICall("DELETE", `/api/note/${note.id}`, null, 200).then(
                    (delResp) => {
                        expect(delResp.body).to.have.property("success", true);
                    },
                );
            },
        );
    });

    it("Round-trips an emoji when a note is updated", () => {
        cy.makePrivateAdminAPICall(
            "POST",
            "/api/family/1/note",
            { text: "<p>Plain ASCII body</p>", private: false },
            201,
        ).then((createResp) => {
            const noteId = createResp.body.note.id;
            createdNoteIds.push(noteId);

            cy.makePrivateAdminAPICall(
                "PUT",
                `/api/note/${noteId}`,
                { text: `<p>Updated with ${emoji}</p>`, private: false },
                200,
            ).then((updateResp) => {
                expect(updateResp.body.note.text).to.contain(emoji);
            });

            cy.makePrivateAdminAPICall("GET", `/api/note/${noteId}`, null, 200).then((getResp) => {
                expect(getResp.body.note.text).to.contain(emoji);
            });

            cy.makePrivateAdminAPICall("DELETE", `/api/note/${noteId}`, null, 200);
        });
    });
});
