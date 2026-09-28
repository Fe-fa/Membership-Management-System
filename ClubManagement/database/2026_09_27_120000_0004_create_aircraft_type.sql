-- Baseline schema for dbo.Aircraft_type. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Aircraft_type', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Aircraft_type] (
        [aircraft_type_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Aircraft___sort___1EA48E88] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Aircraft___is_ac__1F98B2C1] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Aircraft___creat__208CD6FA] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Aircraft_type] PRIMARY KEY ([aircraft_type_id])
    );
END
GO
