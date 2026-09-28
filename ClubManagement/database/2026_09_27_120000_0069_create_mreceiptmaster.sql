-- Baseline schema for dbo.MReceiptMaster. This file is not executed by the application.
IF OBJECT_ID(N'dbo.MReceiptMaster', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MReceiptMaster] (
        [receipt_id] bigint IDENTITY(1,1) NOT NULL,
        [receipt_number] nvarchar(50) NOT NULL,
        [transaction_id] bigint NOT NULL,
        [amount] decimal(12,2) NOT NULL,
        [issued_date] date NOT NULL,
        [issued_by_user_id] bigint NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__MReceiptM__creat__1975C517] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [cheque_document_id] bigint NULL,
        CONSTRAINT [PK_MReceiptMaster] PRIMARY KEY ([receipt_id])
    );
END
GO
