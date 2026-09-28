-- Baseline schema for dbo.Credit_facility. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Credit_facility', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Credit_facility] (
        [credit_facility_id] bigint IDENTITY(1,1) NOT NULL,
        [account_id] bigint NOT NULL,
        [amount] decimal(12,2) NOT NULL,
        [approved_by_profile_id] bigint NULL,
        [approval_date] date NULL,
        [status] nvarchar(30) NOT NULL CONSTRAINT [DF__Credit_fa__statu__51BA1E3A] DEFAULT (N'OPEN'),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Credit_fa__creat__52AE4273] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Credit_facility] PRIMARY KEY ([credit_facility_id])
    );
END
GO
