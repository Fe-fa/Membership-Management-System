-- Baseline schema for dbo.MGuest. This file is not executed by the application.
IF OBJECT_ID(N'dbo.MGuest', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MGuest] (
        [guest_id] bigint IDENTITY(1,1) NOT NULL,
        [guest_profile_id] bigint NULL,
        [guest_name] nvarchar(150) NOT NULL,
        [introduced_by_profile_id] bigint NULL,
        [guest_status_id] bigint NOT NULL,
        [barred_reason] nvarchar(MAX) NULL,
        [is_active] bit NOT NULL CONSTRAINT [DF__MGuest__is_activ__73501C2F] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__MGuest__created___74444068] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [phone] nvarchar(40) NULL,
        [visit_slip_code] nvarchar(20) NULL,
        [email] nvarchar(255) NULL,
        CONSTRAINT [PK_MGuest] PRIMARY KEY ([guest_id])
    );
END
GO
