-- Baseline schema for dbo.Club. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Club', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Club] (
        [club_id] bigint IDENTITY(1,1) NOT NULL,
        [club_name] nvarchar(150) NOT NULL,
        [club_type_id] bigint NOT NULL,
        [address] nvarchar(255) NULL,
        [city] nvarchar(100) NULL,
        [country_id] bigint NULL,
        [contact_phone] nvarchar(50) NULL,
        [contact_email] nvarchar(150) NULL,
        [is_active] bit NOT NULL CONSTRAINT [DF__Club__is_active__6166761E] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Club__created_at__625A9A57] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Club] PRIMARY KEY ([club_id])
    );
END
GO
