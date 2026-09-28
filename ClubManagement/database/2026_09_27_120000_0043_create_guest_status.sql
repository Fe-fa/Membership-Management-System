-- Baseline schema for dbo.Guest_status. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Guest_status', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Guest_status] (
        [guest_status_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Guest_sta__sort___40058253] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Guest_sta__is_ac__40F9A68C] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Guest_sta__creat__41EDCAC5] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Guest_status] PRIMARY KEY ([guest_status_id])
    );
END
GO
