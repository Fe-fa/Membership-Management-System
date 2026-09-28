-- Baseline schema for dbo.Reversal_entry. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Reversal_entry', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Reversal_entry] (
        [reversal_id] bigint IDENTITY(1,1) NOT NULL,
        [source_transaction_id] bigint NOT NULL,
        [reversal_transaction_id] bigint NOT NULL,
        [account_id] bigint NULL,
        [reason] nvarchar(500) NOT NULL,
        [approved_by_committee] bit NOT NULL CONSTRAINT [DF_rev_committee] DEFAULT ((0)),
        [approver_user_id] bigint NULL,
        [approver_name] nvarchar(200) NULL,
        [approver_role] nvarchar(80) NULL,
        [reversed_at] datetime2(7) NOT NULL,
        [reversed_by_user_id] bigint NULL,
        [created_at] datetime2(7) NOT NULL,
        CONSTRAINT [PK__Reversal__E45BF6315602F76F] PRIMARY KEY ([reversal_id])
    );
END
GO
