CREATE SCHEMA intake;
CREATE TABLE intake.mailboxes (id text PRIMARY KEY, tenant_id text NOT NULL, provider_id text NOT NULL, UNIQUE(tenant_id,provider_id));
CREATE TABLE intake.folders (
 mailbox_id text NOT NULL REFERENCES intake.mailboxes(id) ON DELETE CASCADE,
 id text NOT NULL, name text NOT NULL, parent_id text,
 PRIMARY KEY(mailbox_id,id)
);
CREATE TABLE intake.messages (
 mailbox_id text NOT NULL REFERENCES intake.mailboxes(id) ON DELETE CASCADE,
 id text NOT NULL, conversation_id text NOT NULL, subject text NOT NULL,
 received_at timestamptz, is_read boolean NOT NULL,
 PRIMARY KEY(mailbox_id,id)
);
CREATE INDEX messages_conversation ON intake.messages(mailbox_id,conversation_id,id);
CREATE TABLE intake.memberships (
 mailbox_id text NOT NULL, folder_id text NOT NULL, message_id text NOT NULL, generation uuid NOT NULL,
 PRIMARY KEY(mailbox_id,folder_id,message_id),
 FOREIGN KEY(mailbox_id,folder_id) REFERENCES intake.folders(mailbox_id,id) ON DELETE CASCADE,
 FOREIGN KEY(mailbox_id,message_id) REFERENCES intake.messages(mailbox_id,id) ON DELETE CASCADE
);
CREATE TABLE intake.sync_state (
 mailbox_id text NOT NULL, folder_id text NOT NULL, cursor text, generation uuid NOT NULL,
 full_sync boolean NOT NULL DEFAULT true,
 PRIMARY KEY(mailbox_id,folder_id),
 FOREIGN KEY(mailbox_id,folder_id) REFERENCES intake.folders(mailbox_id,id) ON DELETE CASCADE
);
CREATE TABLE intake.jobs (
 id uuid PRIMARY KEY, mailbox_id text NOT NULL, folder_id text NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','running','succeeded','failed')),
 pages integer NOT NULL DEFAULT 0, lease uuid, lease_until timestamptz,
 error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(mailbox_id,folder_id) REFERENCES intake.folders(mailbox_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX one_active_folder_job ON intake.jobs(mailbox_id,folder_id) WHERE status IN ('queued','running');
