-- Baseline schema for dbo.Membership_invoice. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Membership_invoice', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Membership_invoice] (
        [invoice_id] bigint IDENTITY(1,1) NOT NULL,
        [invoice_no] nvarchar(40) NOT NULL,
        [account_id] bigint NOT NULL,
        [subscription_id] bigint NULL,
        [year] int NOT NULL,
        [issued_at] datetime2(7) NOT NULL,
        [due_date] date NOT NULL,
        [amount] decimal(18,2) NOT NULL,
        [status] nvarchar(40) NOT NULL,
        [sent_at] datetime2(7) NULL,
        [sent_to_email] nvarchar(200) NULL,
        [created_at] datetime2(7) NOT NULL,
        [created_by_user_id] bigint NULL,
        [published_to_member] bit NOT NULL CONSTRAINT [DF_inv_published] DEFAULT ((0)),
        CONSTRAINT [PK__Membersh__F58DFD49239877C5] PRIMARY KEY ([invoice_id])
    );
END
GO
