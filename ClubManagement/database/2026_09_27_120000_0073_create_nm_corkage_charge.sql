-- Baseline schema for dbo.Nm_corkage_charge. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Nm_corkage_charge', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Nm_corkage_charge] (
        [nm_corkage_charge_id] bigint IDENTITY(1,1) NOT NULL,
        [payer_name] nvarchar(200) NOT NULL,
        [account_id] bigint NULL,
        [is_guest] bit NOT NULL CONSTRAINT [DF_nm_cork_is_guest] DEFAULT ((1)),
        [item_description] nvarchar(500) NOT NULL,
        [fee_amount] decimal(18,2) NOT NULL,
        [authorized_by_manager] bit NOT NULL CONSTRAINT [DF_nm_cork_auth] DEFAULT ((0)),
        [manager_name] nvarchar(200) NULL,
        [status] nvarchar(40) NOT NULL,
        [receipt_no] nvarchar(40) NULL,
        [paid_at] datetime2(7) NULL,
        [payment_method] nvarchar(40) NULL,
        [reference_code] nvarchar(80) NULL,
        [created_at] datetime2(7) NOT NULL,
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        CONSTRAINT [PK__Nm_corka__E7BFE47342F3B2EA] PRIMARY KEY ([nm_corkage_charge_id])
    );
END
GO
