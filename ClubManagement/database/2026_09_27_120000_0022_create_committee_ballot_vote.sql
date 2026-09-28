-- Baseline schema for dbo.Committee_ballot_vote. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Committee_ballot_vote', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Committee_ballot_vote] (
        [committee_ballot_vote_id] bigint IDENTITY(1,1) NOT NULL,
        [committee_ballot_item_id] bigint NOT NULL,
        [voter_profile_id] bigint NOT NULL,
        [vote_value] nvarchar(20) NOT NULL,
        [cast_at] datetime2(7) NOT NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF_cbv_created] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        CONSTRAINT [PK_Committee_ballot_vote] PRIMARY KEY ([committee_ballot_vote_id])
    );
END
GO
