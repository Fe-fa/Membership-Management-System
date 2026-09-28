-- Baseline schema for dbo.Club_event. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Club_event', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Club_event] (
        [club_event_id] bigint IDENTITY(1,1) NOT NULL,
        [title] nvarchar(200) NOT NULL,
        [location] nvarchar(200) NULL,
        [description] nvarchar(2000) NULL,
        [starts_at] datetime2(7) NOT NULL,
        [ends_at] datetime2(7) NULL,
        [is_published] bit NOT NULL CONSTRAINT [DF_club_event_published] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL,
        [created_by_user_id] bigint NULL,
        CONSTRAINT [PK__Club_eve__954F338303CA1154] PRIMARY KEY ([club_event_id])
    );
END
GO
