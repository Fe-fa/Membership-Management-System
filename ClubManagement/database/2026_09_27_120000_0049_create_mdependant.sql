-- Baseline schema for dbo.MDependant. This file is not executed by the application.
IF OBJECT_ID(N'dbo.MDependant', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MDependant] (
        [dependant_id] bigint IDENTITY(1,1) NOT NULL,
        [profile_id] bigint NOT NULL,
        [dependant_profile_id] bigint NULL,
        [relationship_type_id] bigint NOT NULL,
        [dependant_name] nvarchar(150) NOT NULL,
        [dependant_dob] date NULL,
        [telephone] nvarchar(30) NULL,
        [email] nvarchar(150) NULL,
        [is_below_18_flag] bit NOT NULL CONSTRAINT [DF__MDependan__is_be__51EF2864] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__MDependan__is_ac__52E34C9D] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__MDependan__creat__53D770D6] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_MDependant] PRIMARY KEY ([dependant_id])
    );
END
GO
