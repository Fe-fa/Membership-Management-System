-- Baseline schema for dbo.Disciplinary_action. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Disciplinary_action', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Disciplinary_action] (
        [disciplinary_action_id] bigint IDENTITY(1,1) NOT NULL,
        [account_id] bigint NOT NULL,
        [action_type_id] bigint NOT NULL,
        [reason] nvarchar(MAX) NULL,
        [decision_date] date NULL,
        [effective_from] date NULL,
        [effective_to] date NULL,
        [imposed_by_meeting_id] bigint NULL,
        [approved_by_profile_id] bigint NULL,
        [status] nvarchar(30) NOT NULL CONSTRAINT [DF__Disciplin__statu__2AA05119] DEFAULT (N'ACTIVE'),
        [notes] nvarchar(MAX) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Disciplin__creat__2B947552] DEFAULT (sysutcdatetime()),
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Disciplinary_action] PRIMARY KEY ([disciplinary_action_id])
    );
END
GO
