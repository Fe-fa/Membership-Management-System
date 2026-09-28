-- Baseline schema for dbo.Reinstatement. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Reinstatement', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Reinstatement] (
        [reinstatement_id] bigint IDENTITY(1,1) NOT NULL,
        [account_id] bigint NOT NULL,
        [disciplinary_action_id] bigint NULL,
        [reinstatement_date] date NOT NULL,
        [reason] nvarchar(MAX) NULL,
        [arrears_settled_flag] bit NOT NULL CONSTRAINT [DF__Reinstate__arrea__324172E1] DEFAULT ((0)),
        [new_entrance_fee_paid_flag] bit NOT NULL CONSTRAINT [DF__Reinstate__new_e__3335971A] DEFAULT ((0)),
        [reapplication_id] bigint NULL,
        [approved_by_profile_id] bigint NULL,
        [status] nvarchar(30) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Reinstate__creat__3429BB53] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Reinstatement] PRIMARY KEY ([reinstatement_id])
    );
END
GO
