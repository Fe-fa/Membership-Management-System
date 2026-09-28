-- Baseline schema for dbo.Meeting_agenda_item. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Meeting_agenda_item', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Meeting_agenda_item] (
        [meeting_agenda_item_id] bigint IDENTITY(1,1) NOT NULL,
        [general_meeting_id] bigint NOT NULL,
        [resolution_id] bigint NULL,
        [subject] nvarchar(255) NOT NULL,
        [is_special_business_flag] bit NOT NULL CONSTRAINT [DF__Meeting_a__is_sp__75035A77] DEFAULT ((0)),
        [sort_order] int NOT NULL CONSTRAINT [DF__Meeting_a__sort___75F77EB0] DEFAULT ((0)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Meeting_a__creat__76EBA2E9] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Meeting_agenda_item] PRIMARY KEY ([meeting_agenda_item_id])
    );
END
GO
