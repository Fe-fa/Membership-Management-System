-- Baseline schema for dbo.Billing_document. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Billing_document', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Billing_document] (
        [billing_document_id] bigint IDENTITY(1,1) NOT NULL,
        [document_no] nvarchar(40) NOT NULL,
        [kind] nvarchar(20) NOT NULL,
        [fee_type] nvarchar(40) NOT NULL,
        [audience] nvarchar(20) NOT NULL,
        [account_id] bigint NULL,
        [application_id] bigint NULL,
        [charge_id] bigint NULL,
        [membership_invoice_id] bigint NULL,
        [year] int NULL,
        [period_from] date NULL,
        [period_to] date NULL,
        [party_name] nvarchar(200) NOT NULL,
        [party_no] nvarchar(80) NULL,
        [email] nvarchar(200) NULL,
        [amount] decimal(18,2) NOT NULL,
        [amount_paid] decimal(18,2) NOT NULL CONSTRAINT [DF_bd_paid] DEFAULT ((0)),
        [balance] decimal(18,2) NOT NULL,
        [document_html] nvarchar(MAX) NULL,
        [status] nvarchar(30) NOT NULL,
        [email_after_approval] bit NOT NULL CONSTRAINT [DF_bd_email] DEFAULT ((0)),
        [submitted_at] datetime2(7) NOT NULL,
        [submitted_by_user_id] bigint NULL,
        [reviewed_at] datetime2(7) NULL,
        [reviewed_by_user_id] bigint NULL,
        [review_notes] nvarchar(500) NULL,
        [published_at] datetime2(7) NULL,
        [sent_at] datetime2(7) NULL,
        [sent_to_email] nvarchar(200) NULL,
        [created_at] datetime2(7) NOT NULL,
        [created_by_user_id] bigint NULL,
        CONSTRAINT [PK__Billing___DCCE09514BDE78D2] PRIMARY KEY ([billing_document_id])
    );
END
GO
