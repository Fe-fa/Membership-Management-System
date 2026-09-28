-- Baseline schema for dbo.Committee. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Committee', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Committee] (
        [committee_id] bigint IDENTITY(1,1) NOT NULL,
        [committee_name] nvarchar(150) NOT NULL,
        [term_start] date NULL,
        [term_end] date NULL,
        [is_active] bit NOT NULL CONSTRAINT [DF__Committee__is_ac__671F4F74] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Committee__creat__681373AD] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [committee_type] nvarchar(40) NOT NULL CONSTRAINT [DF_committee_type] DEFAULT (N'main'),
        [tenant_id] bigint NOT NULL,
        CONSTRAINT [PK_Committee] PRIMARY KEY ([committee_id])
    );
END
GO
