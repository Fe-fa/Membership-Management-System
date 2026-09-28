-- Baseline schema for dbo.Committee_ballot_item. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Committee_ballot_item', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Committee_ballot_item] (
        [committee_ballot_item_id] bigint IDENTITY(1,1) NOT NULL,
        [committee_meeting_id] bigint NOT NULL,
        [application_id] bigint NOT NULL,
        [status] nvarchar(20) NOT NULL CONSTRAINT [DF_cbi_status] DEFAULT (N'OPEN'),
        [resolved_at] datetime2(7) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF_cbi_created] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        CONSTRAINT [PK_Committee_ballot_item] PRIMARY KEY ([committee_ballot_item_id])
    );
END
GO
