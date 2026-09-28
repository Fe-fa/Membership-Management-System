-- Baseline schema for dbo.Resolution. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Resolution', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Resolution] (
        [resolution_id] bigint IDENTITY(1,1) NOT NULL,
        [committee_meeting_id] bigint NOT NULL,
        [resolution_type_id] bigint NOT NULL,
        [subject] nvarchar(255) NOT NULL,
        [resolution_text] nvarchar(MAX) NULL,
        [passed_flag] bit NOT NULL CONSTRAINT [DF__Resolutio__passe__4183B671] DEFAULT ((0)),
        [effective_date] date NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Resolutio__creat__4277DAAA] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Resolution] PRIMARY KEY ([resolution_id])
    );
END
GO
