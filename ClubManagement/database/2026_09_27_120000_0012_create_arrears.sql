-- Baseline schema for dbo.Arrears. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Arrears', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Arrears] (
        [arrears_id] bigint IDENTITY(1,1) NOT NULL,
        [account_id] bigint NOT NULL,
        [subscription_id] bigint NULL,
        [opened_date] date NOT NULL,
        [amount] decimal(12,2) NOT NULL,
        [status] nvarchar(30) NOT NULL CONSTRAINT [DF__Arrears__status__1E3A7A34] DEFAULT (N'OPEN'),
        [settled_date] date NULL,
        [settled_by_transaction_id] bigint NULL,
        [removal_reference_id] bigint NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Arrears__created__1F2E9E6D] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Arrears] PRIMARY KEY ([arrears_id])
    );
END
GO
