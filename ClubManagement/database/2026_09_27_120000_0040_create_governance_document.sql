-- Baseline schema for dbo.Governance_document. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Governance_document', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Governance_document] (
        [governance_document_id] bigint IDENTITY(1,1) NOT NULL,
        [document_name] nvarchar(150) NOT NULL,
        [document_type_id] bigint NOT NULL,
        [current_version_id] bigint NULL,
        [code] nvarchar(50) NULL,
        [name] nvarchar(150) NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Governanc__sort___6BE40491] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Governanc__is_ac__6CD828CA] DEFAULT ((1)),
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Governance_document] PRIMARY KEY ([governance_document_id])
    );
END
GO
