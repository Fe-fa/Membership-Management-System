-- Baseline schema for dbo.Fee_waiver. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Fee_waiver', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Fee_waiver] (
        [fee_waiver_id] bigint IDENTITY(1,1) NOT NULL,
        [account_id] bigint NOT NULL,
        [parent_account_id] bigint NULL,
        [parent_continuous_years] int NULL,
        [fee_type_id] bigint NOT NULL,
        [amount_waived] decimal(12,2) NOT NULL,
        [waiver_date] date NOT NULL,
        [approved_by_user_id] bigint NULL,
        [reason] nvarchar(MAX) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Fee_waive__creat__24E777C3] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Fee_waiver] PRIMARY KEY ([fee_waiver_id])
    );
END
GO
