-- Baseline schema for dbo.Subscription. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Subscription', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Subscription] (
        [subscription_id] bigint IDENTITY(1,1) NOT NULL,
        [account_id] bigint NOT NULL,
        [subscription_year] int NOT NULL,
        [amount_due] decimal(12,2) NOT NULL CONSTRAINT [DF__Subscript__amoun__0662F0A3] DEFAULT ((0.00)),
        [due_date] date NULL,
        [posted_date] date NULL,
        [removal_date] date NULL,
        [amount_paid] decimal(12,2) NOT NULL CONSTRAINT [DF__Subscript__amoun__075714DC] DEFAULT ((0.00)),
        [arrears_amount] decimal(12,2) NOT NULL CONSTRAINT [DF__Subscript__arrea__084B3915] DEFAULT ((0.00)),
        [subscription_status_id] bigint NOT NULL,
        [waived_flag] bit NOT NULL CONSTRAINT [DF__Subscript__waive__093F5D4E] DEFAULT ((0)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Subscript__creat__0A338187] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Subscription] PRIMARY KEY ([subscription_id])
    );
END
GO
