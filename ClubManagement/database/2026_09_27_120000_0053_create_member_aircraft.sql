-- Baseline schema for dbo.Member_aircraft. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Member_aircraft', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Member_aircraft] (
        [member_aircraft_id] bigint IDENTITY(1,1) NOT NULL,
        [profile_id] bigint NOT NULL,
        [aircraft_type_id] bigint NOT NULL,
        [registration_number] nvarchar(100) NOT NULL,
        [hangar_location] nvarchar(150) NULL,
        [is_co_owned] bit NOT NULL CONSTRAINT [DF__Member_ai__is_co__65F62111] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Member_ai__is_ac__66EA454A] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Member_ai__creat__67DE6983] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [country_of_registration] nvarchar(120) NULL,
        CONSTRAINT [PK_Member_aircraft] PRIMARY KEY ([member_aircraft_id])
    );
END
GO
