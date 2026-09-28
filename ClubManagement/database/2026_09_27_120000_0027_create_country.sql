-- Baseline schema for dbo.Country. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Country', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Country] (
        [country_id] bigint IDENTITY(1,1) NOT NULL,
        [country_code] nvarchar(10) NOT NULL,
        [country_name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Country__sort_or__18EBB532] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Country__is_acti__19DFD96B] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Country__created__1AD3FDA4] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Country] PRIMARY KEY ([country_id])
    );
END
GO
