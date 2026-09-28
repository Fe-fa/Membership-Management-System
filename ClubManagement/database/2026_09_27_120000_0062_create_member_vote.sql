-- Baseline schema for dbo.Member_vote. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Member_vote', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Member_vote] (
        [member_vote_id] bigint IDENTITY(1,1) NOT NULL,
        [general_meeting_id] bigint NOT NULL,
        [general_meeting_business_item_id] bigint NOT NULL,
        [voter_profile_id] bigint NOT NULL,
        [vote_method] nvarchar(30) NOT NULL,
        [vote_value] nvarchar(20) NOT NULL,
        [cast_via_proxy_id] bigint NULL,
        [cast_at] datetime2(7) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Member_vo__creat__035179CE] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Member_vote] PRIMARY KEY ([member_vote_id])
    );
END
GO
