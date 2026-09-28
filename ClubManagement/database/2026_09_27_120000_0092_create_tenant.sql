-- Baseline schema for dbo.Tenant. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Tenant', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Tenant] (
        [tenant_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(40) NOT NULL,
        [name] nvarchar(200) NOT NULL,
        [short_name] nvarchar(80) NULL,
        [contact_email] nvarchar(200) NULL,
        [contact_phone] nvarchar(40) NULL,
        [address_line] nvarchar(400) NULL,
        [is_active] bit NOT NULL CONSTRAINT [DF_tenant_active] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL,
        [logo_url] nvarchar(MAX) NULL,
        [physical_location] nvarchar(400) NULL,
        [town] nvarchar(120) NULL,
        [pin_number] nvarchar(40) NULL,
        [country_id] bigint NULL,
        [slug] nvarchar(80) NULL,
        CONSTRAINT [PK__Tenant__D6F29F3E73E81275] PRIMARY KEY ([tenant_id])
    );
END
GO
