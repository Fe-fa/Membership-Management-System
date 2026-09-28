-- Baseline schema for dbo.Nm_custom_charge. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Nm_custom_charge', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Nm_custom_charge] (
        [nm_custom_charge_id] bigint IDENTITY(1,1) NOT NULL,
        [payer_name] nvarchar(200) NOT NULL,
        [account_id] bigint NULL,
        [category] nvarchar(60) NOT NULL,
        [total_amount] decimal(18,2) NOT NULL,
        [status] nvarchar(40) NOT NULL,
        [receipt_no] nvarchar(40) NULL,
        [paid_at] datetime2(7) NULL,
        [payment_method] nvarchar(40) NULL,
        [reference_code] nvarchar(80) NULL,
        [created_by_username] nvarchar(120) NULL,
        [created_at] datetime2(7) NOT NULL,
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        CONSTRAINT [PK__Nm_custo__82FE0601FBBDBBA4] PRIMARY KEY ([nm_custom_charge_id])
    );
END
GO
