-- Baseline schema for dbo.MTransaction. This file is not executed by the application.
IF OBJECT_ID(N'dbo.MTransaction', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MTransaction] (
        [transaction_id] bigint IDENTITY(1,1) NOT NULL,
        [profile_id] bigint NULL,
        [account_id] bigint NULL,
        [subscription_id] bigint NULL,
        [fee_type_id] bigint NOT NULL,
        [payment_method_id] bigint NOT NULL,
        [payment_status_id] bigint NOT NULL,
        [amount] decimal(12,2) NOT NULL,
        [payment_date] date NULL,
        [cheque_no] nvarchar(100) NULL,
        [mpesa_code] nvarchar(100) NULL,
        [receipt_id] bigint NULL,
        [reference_note] nvarchar(255) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__MTransact__creat__0EF836A4] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [cheque_bank_name] nvarchar(120) NULL,
        [cheque_bank_code] nvarchar(20) NULL,
        [cheque_date] date NULL,
        [cheque_document_id] bigint NULL,
        CONSTRAINT [PK_MTransaction] PRIMARY KEY ([transaction_id])
    );
END
GO
