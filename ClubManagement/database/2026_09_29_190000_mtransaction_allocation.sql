-- Advance payments and multi-allocation billing.
-- Receiving money (MTransaction) and applying it to an invoice (MTransactionAllocation)
-- are separate events. A transaction amount is never reduced when credit is applied.
--
-- invoice_id / transaction_id are BIGINT, matching the existing identity keys.
-- An INT foreign key cannot reference those BIGINT primary keys.

IF COL_LENGTH(N'dbo.MTransaction', N'invoice_id') IS NULL
    ALTER TABLE dbo.MTransaction ADD invoice_id BIGINT NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_MTransaction_invoice_id'
      AND object_id = OBJECT_ID(N'dbo.MTransaction'))
    CREATE NONCLUSTERED INDEX IX_MTransaction_invoice_id
        ON dbo.MTransaction(invoice_id)
        WHERE invoice_id IS NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_MTransaction_Membership_invoice')
AND OBJECT_ID(N'dbo.Membership_invoice', N'U') IS NOT NULL
    ALTER TABLE dbo.MTransaction
        ADD CONSTRAINT FK_MTransaction_Membership_invoice
        FOREIGN KEY (invoice_id) REFERENCES dbo.Membership_invoice(invoice_id);
GO

IF OBJECT_ID(N'dbo.MTransactionAllocation', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MTransactionAllocation (
        allocation_id BIGINT IDENTITY(1,1) NOT NULL,
        transaction_id BIGINT NOT NULL,
        invoice_id BIGINT NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        allocated_at DATETIME2(7) NOT NULL
            CONSTRAINT DF_MTransactionAllocation_allocated_at DEFAULT (SYSUTCDATETIME()),
        allocated_by_user_id BIGINT NULL,
        created_at DATETIME2(7) NOT NULL
            CONSTRAINT DF_MTransactionAllocation_created_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_MTransactionAllocation PRIMARY KEY CLUSTERED (allocation_id),
        CONSTRAINT CK_MTransactionAllocation_amount CHECK (amount > 0),
        CONSTRAINT FK_MTransactionAllocation_MTransaction
            FOREIGN KEY (transaction_id) REFERENCES dbo.MTransaction(transaction_id),
        CONSTRAINT FK_MTransactionAllocation_Membership_invoice
            FOREIGN KEY (invoice_id) REFERENCES dbo.Membership_invoice(invoice_id)
    );

    CREATE NONCLUSTERED INDEX IX_MTransactionAllocation_transaction_id
        ON dbo.MTransactionAllocation(transaction_id);
    CREATE NONCLUSTERED INDEX IX_MTransactionAllocation_invoice_id
        ON dbo.MTransactionAllocation(invoice_id);
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Fee_type WHERE code = N'ADVANCE')
    INSERT INTO dbo.Fee_type (code, name, sort_order, is_active, created_at)
    VALUES (N'ADVANCE', N'Advance payment / credit', 55, 1, SYSUTCDATETIME());
GO
